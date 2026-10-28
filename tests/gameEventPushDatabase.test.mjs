import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ATTACKER = id(1), DEFENDER = id(2), NO_DEVICE = id(3), OPTED_OUT = id(4), STREAKER = id(5), TEACHER = id(9);
// Fixed future instants (Asia/Bishkek = UTC+6) so quiet-hour times are never clamped to "now".
const BKK = (local) => `${local}+06`;

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table auth.users(id uuid primary key);
create table public.users(id uuid primary key, username text);
create table public.assignments(id uuid primary key default gen_random_uuid(), title text, subject_name text,
  publish_status text default 'published', assigned_at timestamptz default now(), due_at timestamptz);
create table public.student_assignments(id uuid primary key default gen_random_uuid(), assignment_id uuid, student_id uuid,
  status text default 'pending', due_at timestamptz);
create table public.pvp_attack_attempts(request_id uuid primary key default gen_random_uuid(), attacker_id uuid, defender_id uuid, response jsonb, created_at timestamptz default now());
create table public.clans(id uuid primary key default gen_random_uuid(), name text);
create table public.clan_members(id uuid primary key default gen_random_uuid(), clan_id uuid, user_id uuid, role text, unique(clan_id, user_id));
create table public.clan_chat(id uuid primary key default gen_random_uuid(), clan_id uuid, user_id uuid, username text, message text, created_at timestamptz default now());
create table public.clan_join_requests(id uuid primary key default gen_random_uuid(), clan_id uuid, user_id uuid, status text default 'pending');
create table public.clan_buff_templates(id uuid primary key default gen_random_uuid(), name text, duration_minutes integer);
create table public.clan_buffs(id uuid primary key default gen_random_uuid(), clan_id uuid, template_id uuid, activated_by uuid);
create table public.rivalry_wars(id uuid primary key default gen_random_uuid(), attacker_clan_id uuid, defender_clan_id uuid, status text, winner_clan_id uuid);
create table public.daily_streak_rewards(user_id uuid, reward_date date, streak integer, coins_awarded integer default 100, created_at timestamptz default now(), primary key(user_id, reward_date));
insert into auth.users values ('${ATTACKER}'),('${DEFENDER}'),('${NO_DEVICE}'),('${OPTED_OUT}'),('${STREAKER}'),('${TEACHER}');
insert into public.users values ('${ATTACKER}','Aidai'),('${DEFENDER}','Bek'),('${NO_DEVICE}','Nurlan'),('${OPTED_OUT}','Ruslan'),('${STREAKER}','Zara'),('${TEACHER}','Jess');
`);
await db.exec(readFileSync('supabase/migrations/20261028170000_student_push_notifications.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/20261029120000_game_event_push_notifications.sql', 'utf8'));
await db.exec(`grant usage on schema public to anon, authenticated, service_role;
insert into public.push_subscriptions(user_id, endpoint, p256dh, auth) values
  ('${DEFENDER}','https://push.example/d','k','a'),('${OPTED_OUT}','https://push.example/o','k','a'),('${STREAKER}','https://push.example/s','k','a');
insert into public.push_preferences(user_id, game_events) values ('${OPTED_OUT}', false);`);

const rows = async (where) => (await db.query(`select * from public.push_notification_outbox where ${where} order by created_at, idempotency_key`)).rows;
const pvp = (attacker, defender, response, at) =>
  db.query('select private.push_pvp_defence($1,$2,$3::jsonb,$4::timestamptz)', [attacker, defender, JSON.stringify(response), at]);
const win = (coins) => ({ result: 'win', defender_deltas: { coins_loss: coins } });

test('quiet hours: 22:00–07:00 Bishkek waits until 07:00, daytime sends now', async () => {
  const at = async (local) => (await db.query(`select to_char(private.game_push_available_at($1::timestamptz) at time zone 'Asia/Bishkek','YYYY-MM-DD HH24:MI') v`, [BKK(local)])).rows[0].v;
  assert.equal(await at('2030-01-15 21:59'), '2030-01-15 21:59');
  assert.equal(await at('2030-01-15 22:00'), '2030-01-16 07:00');
  assert.equal(await at('2030-01-16 06:59'), '2030-01-16 07:00');
  assert.equal(await at('2030-01-16 07:00'), '2030-01-16 07:00');
});

test('PvP: one message per 3-hour block, right wording, nothing for shields, self-attacks, opted-out or device-less players', async () => {
  await pvp(ATTACKER, DEFENDER, win(35), BKK('2030-01-15 10:05'));
  await pvp(ATTACKER, DEFENDER, win(20), BKK('2030-01-15 11:40'));   // same 09–12 block
  await pvp(ATTACKER, DEFENDER, { result: 'lose', defender_deltas: { coins_loss: 0 } }, BKK('2030-01-15 12:10'));
  await pvp(ATTACKER, DEFENDER, { result: 'blocked' }, BKK('2030-01-15 16:00'));
  await pvp(DEFENDER, DEFENDER, win(5), BKK('2030-01-15 16:00'));
  await pvp(ATTACKER, NO_DEVICE, win(5), BKK('2030-01-15 16:00'));
  await pvp(ATTACKER, OPTED_OUT, win(5), BKK('2030-01-15 16:00'));
  const got = await rows(`event_type='pvp_defence'`);
  assert.deepEqual(got.map((r) => [r.user_id, r.title, r.body]), [
    [DEFENDER, '⚔️ Aidai raided you', 'They took 35 coins. Hit back!'],
    [DEFENDER, '🛡️ You held off Aidai', 'Your defences held. Want revenge?'],
  ]);
  assert.equal(got[0].url, '/?view=pvp');
});

test('PvP overnight: many attacks become one 07:00 message', async () => {
  await pvp(ATTACKER, DEFENDER, win(10), BKK('2030-01-15 23:10'));
  await pvp(ATTACKER, DEFENDER, win(10), BKK('2030-01-16 02:30'));
  await pvp(ATTACKER, DEFENDER, win(10), BKK('2030-01-16 05:55'));
  const night = await rows(`idempotency_key like '%-overnight'`);
  assert.equal(night.length, 1);
  assert.equal((await db.query(`select to_char($1::timestamptz at time zone 'Asia/Bishkek','YYYY-MM-DD HH24:MI') v`, [night[0].available_at])).rows[0].v, '2030-01-16 07:00');
});

test('the attack itself is never blocked: trigger queues on insert and swallows push errors', async () => {
  const before = (await rows(`event_type='pvp_defence'`)).length;
  await db.query(`insert into public.pvp_attack_attempts(attacker_id, defender_id, response) values ($1,$2,$3::jsonb)`, [ATTACKER, DEFENDER, JSON.stringify(win(1))]);
  assert.equal((await rows(`event_type='pvp_defence'`)).length, before + 1, 'trigger queued a message (today, real clock)');
  await db.exec('alter table public.push_notification_outbox rename to push_notification_outbox_off');
  try {
    await db.query(`insert into public.pvp_attack_attempts(attacker_id, defender_id, response) values ($1,$2,$3::jsonb)`, [ATTACKER, NO_DEVICE, JSON.stringify(win(1))]);
    await db.query(`insert into public.pvp_attack_attempts(attacker_id, defender_id, response) values ($1,$2,null)`, [ATTACKER, DEFENDER]);
  } finally {
    await db.exec('alter table public.push_notification_outbox_off rename to push_notification_outbox');
  }
  assert.equal((await db.query('select count(*)::int c from public.pvp_attack_attempts')).rows[0].c, 3, 'all attacks were saved');
});

test('streak reminder: 18:30–19:30 only, once a day, only for streaks of 2+ that will break tonight', async () => {
  await db.exec(`insert into public.daily_streak_rewards(user_id, reward_date, streak) values
    ('${STREAKER}','2030-01-14',4),
    ('${DEFENDER}','2030-01-14',1),
    ('${OPTED_OUT}','2030-01-14',6),
    ('${NO_DEVICE}','2030-01-14',9);`);
  const run = async (local) => (await db.query('select public.rpc_enqueue_streak_push_reminders($1::timestamptz) r', [BKK(local)])).rows[0].r;
  assert.equal((await run('2030-01-15 17:00')).skipped, 'outside_window');
  assert.equal((await run('2030-01-15 18:31')).streak_reminders, 2, 'STREAKER and OPTED_OUT qualify; opt-out is applied when queuing');
  await run('2030-01-15 18:32');
  const reminders = await rows(`event_type='streak_reminder'`);
  assert.deepEqual(reminders.map((r) => [r.user_id, r.title]), [[STREAKER, '🔥 Keep your 4-day streak']]);
  // Played today → no reminder the next evening.
  await db.exec(`insert into public.daily_streak_rewards values ('${STREAKER}','2030-01-15',5,100,now()),('${STREAKER}','2030-01-16',6,100,now());`);
  await run('2030-01-16 18:45');
  assert.equal((await rows(`event_type='streak_reminder'`)).length, 1);
});

test('students control their own Game alerts switch only', async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [DEFENDER]);
  await db.exec('set role authenticated');
  try {
    await db.query(`insert into public.push_preferences(user_id, game_events) values ($1,false) on conflict (user_id) do update set game_events=excluded.game_events`, [DEFENDER]);
    await assert.rejects(db.query(`insert into public.push_preferences(user_id, game_events) values ($1,true)`, [STREAKER]), /row-level security/i);
    const seen = (await db.query('select user_id from public.push_preferences')).rows;
    assert.deepEqual(seen.map((r) => r.user_id), [DEFENDER]);
  } finally { await db.exec('reset role'); }
  const before = (await rows(`event_type='pvp_defence'`)).length;
  await pvp(ATTACKER, DEFENDER, win(9), BKK('2030-02-01 15:00'));
  assert.equal((await rows(`event_type='pvp_defence'`)).length, before, 'switched off → no game messages');
});

test('assignment notifications still fire when the publisher cannot see student devices (definer trigger)', async () => {
  await db.exec(`grant select, update on public.assignments to authenticated; grant select on public.student_assignments to authenticated;`);
  const { rows: [a] } = await db.query(`insert into public.assignments(title, publish_status) values ('Quiz','draft') returning id`);
  await db.query(`insert into public.student_assignments(assignment_id, student_id) values ($1,$2)`, [a.id, STREAKER]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [TEACHER]);
  await db.exec('set role authenticated');
  try { await db.query(`update public.assignments set publish_status='published' where id=$1`, [a.id]); }
  finally { await db.exec('reset role'); }
  assert.equal((await rows(`event_type='assignment_published' and payload->>'title'='Quiz'`)).length, 1);
});

test('clans: chat, join requests, power-ups and wars reach the right members, never the actor, chat throttled', async () => {
  const LEADER = DEFENDER, OFFICER = STREAKER, MEMBER = OPTED_OUT, JOINER = ATTACKER, RIVAL_LEAD = NO_DEVICE;
  await db.exec(`insert into public.push_preferences(user_id, game_events) values ('${MEMBER}', true) on conflict (user_id) do update set game_events = true;
    update public.push_preferences set game_events = true where user_id = '${LEADER}';
    insert into public.push_subscriptions(user_id, endpoint, p256dh, auth) values ('${JOINER}','https://push.example/j','k','a'),('${RIVAL_LEAD}','https://push.example/r','k','a');`);
  const home = (await db.query(`insert into public.clans(name) values ('Night Owls') returning id`)).rows[0].id;
  const rival = (await db.query(`insert into public.clans(name) values ('Red Foxes') returning id`)).rows[0].id;
  await db.query(`insert into public.clan_members(clan_id, user_id, role) values ($1,$3,'leader'),($1,$4,'officer'),($1,$5,'member'),($2,$6,'leader')`,
    [home, rival, LEADER, OFFICER, MEMBER, RIVAL_LEAD]);
  const ev = async (type) => (await rows(`event_type='${type}'`)).map((r) => [r.user_id, r.title, r.body]);

  await db.query(`insert into public.clan_chat(clan_id, user_id, message) values ($1,$2,'Raid at 5?'),($1,$2,'second message same half hour')`, [home, MEMBER]);
  const chat = await ev('clan_chat');
  assert.deepEqual(chat.map((c) => c[0]).sort(), [LEADER, OFFICER].sort(), 'everyone but the sender, once each');
  assert.deepEqual(chat[0].slice(1), ['💬 Night Owls', 'Ruslan: Raid at 5?']);

  const { rows: [req] } = await db.query(`insert into public.clan_join_requests(clan_id, user_id) values ($1,$2) returning id`, [home, JOINER]);
  assert.deepEqual((await ev('clan_join_request')).map((c) => c[0]).sort(), [LEADER, OFFICER].sort(), 'leader and officers only');
  await db.query(`update public.clan_join_requests set status='approved' where id=$1`, [req.id]);
  await db.query(`update public.clan_join_requests set status='approved' where id=$1`, [req.id]);
  assert.deepEqual(await ev('clan_join_answer'), [[JOINER, '✅ Welcome to Night Owls', 'Your request was approved. Say hi in clan chat!']]);

  const { rows: [tpl] } = await db.query(`insert into public.clan_buff_templates(name, duration_minutes) values ('Double Coins', 60) returning id`);
  await db.query(`insert into public.clan_buffs(clan_id, template_id, activated_by) values ($1,$2,$3)`, [home, tpl.id, LEADER]);
  const buffs = await ev('clan_buff');
  assert.deepEqual(buffs.map((b) => b[0]).sort(), [OFFICER, MEMBER].sort(), 'not the player who bought it');
  assert.equal(buffs[0][2], 'Bek powered up Night Owls for 60 minutes.');

  const { rows: [war] } = await db.query(`insert into public.rivalry_wars(attacker_clan_id, defender_clan_id, status) values ($1,$2,'pending_response') returning id`, [home, rival]);
  assert.deepEqual(await ev('rivalry_war'), [[RIVAL_LEAD, '⚔️ Night Owls declared war', 'Accept or decline the challenge in Rivalry.']]);
  await db.query(`update public.rivalry_wars set status='prep' where id=$1`, [war.id]);
  await db.query(`update public.rivalry_wars set status='live' where id=$1`, [war.id]);
  await db.query(`update public.rivalry_wars set status='settled', winner_clan_id=$2 where id=$1`, [war.id, home]);
  const wars = await ev('rivalry_war');
  assert.ok(wars.some(([u, t]) => u === LEADER && t === '⚔️ Challenge accepted'));
  assert.equal(wars.filter(([, t]) => t === '🔥 War is live').length, 4, 'everyone in both clans');
  assert.ok(wars.some(([u, t]) => u === MEMBER && t === '🏆 Your clan won the war'));
  assert.ok(wars.some(([u, t, b]) => u === RIVAL_LEAD && t === 'War over' && b === 'Night Owls won this time. Check your rewards.'));
});

test('clan writes still succeed if the push queue is broken', async () => {
  const { rows: [c] } = await db.query(`select id from public.clans limit 1`);
  await db.exec('alter table public.push_notification_outbox rename to push_notification_outbox_off');
  try {
    await db.query(`insert into public.clan_chat(clan_id, user_id, message) values ($1,$2,'still works')`, [c.id, DEFENDER]);
    await db.query(`insert into public.clan_join_requests(clan_id, user_id) values ($1,$2)`, [c.id, TEACHER]);
  } finally {
    await db.exec('alter table public.push_notification_outbox_off rename to push_notification_outbox');
  }
  assert.equal((await db.query(`select count(*)::int n from public.clan_chat where message='still works'`)).rows[0].n, 1);
});
