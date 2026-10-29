import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Replays the Commander migrations in the order production received them (economy v2 before
// the progression migrations), then the go-live migration, and plays the game as students.
const MIGRATIONS = 'supabase/migrations/';
const ORDER = [
  // already in production
  '20260913073842', '20260913083836', '20260913183000', '20260913190000', '20260915123000',
  '20260916063851', '20260916082308', '20260916123703', '20260916195758', '20260916195926', '20260917145000',
  // go-live deploy
  '20260915140000', '20260915193000', '20260915213000', '20260915233000', '20260915233500', '20261030090000',
];
const files = readdirSync(MIGRATIONS);

const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const STUDENT = id(1), STREAKER = id(2), LONG_STREAK = id(3), FIGHTER = id(4), CAPPED = id(5), TEACHER = id(9);
const RIVALS = [id(11), id(12), id(13), id(14), id(15), id(16), id(17)];

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.users(id uuid primary key, username text, avatar_url text, avatar text,
  coins int not null default 0 check (coins >= 0), gemstones int not null default 0 check (gemstones >= 0),
  xp int default 0, level int default 1, role text default 'student', is_banned boolean default false,
  banned_until timestamptz, school_id uuid);
create table public.reward_event_receipts(id uuid primary key default gen_random_uuid(), user_id uuid, event_type text,
  event_id text, idempotency_key text, created_at timestamptz default now());
grant usage on schema public to anon, authenticated, service_role;
`);
for (const version of ORDER) {
  const file = files.find((name) => name.startsWith(version));
  assert.ok(file, `migration ${version} exists`);
  await db.exec(readFileSync(MIGRATIONS + file, 'utf8'));
}
await db.exec(`insert into public.users(id, username, coins, role) values
  ('${STUDENT}','Aidai',100000,'student'), ('${STREAKER}','Bek',0,'student'), ('${LONG_STREAK}','Cholpon',0,'student'),
  ('${FIGHTER}','Dastan',0,'student'), ('${CAPPED}','Eldiyar',0,'student'), ('${TEACHER}','Teacher',0,'teacher'),
  ${RIVALS.map((rival, index) => `('${rival}','Rival${index}',0,'student')`).join(',')}`);

const asStudent = async (userId, sql, params = []) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${userId}',false);
    select set_config('request.jwt.claim.role','authenticated',false);`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec('reset role');
  }
};
const asService = async (sql, params = []) => {
  await db.exec(`set role service_role; select set_config('request.jwt.claim.role','service_role',false);`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.role','',false);`);
  }
};
const hq = async (userId) => (await asStudent(userId, 'select public.rpc_commander_headquarters() r'))[0].r;
const command = async (userId, operation, target = null) => {
  const version = (await hq(userId)).profile?.version ?? null;
  return (await asStudent(userId, 'select public.rpc_commander_command(gen_random_uuid(), $1, $2, $3) r',
    [operation, target, version]))[0].r;
};
const checkin = async (userId) => (await asStudent(userId, 'select public.rpc_commander_daily_checkin() r'))[0].r;
const awardBattle = async (userId, source, battleId = null) =>
  (await asService('select public.rpc_commander_award_battle_xp($1, $2, $3) r', [userId, source, battleId]))[0].r;
const xpOf = async (userId) => (await db.query(
  `select xp from public.commander_profiles where user_id = $1`, [userId])).rows[0].xp;
const fakeYesterdayLogin = (userId, streak) => db.exec(`
  insert into public.commander_transactions(user_id, campaign_id, request_id, operation, payload, xp_delta, created_at)
  values ('${userId}', 'pilot-v1',
    md5('commander-xp:daily_login:' || ((now() at time zone 'UTC')::date - 1)::text)::uuid,
    'reward', jsonb_build_object('source','daily_login','streak',${streak}), 0, now() - interval '1 day')`);
const victory = async (attacker, defender, status = 'victory') => (await db.query(`
  insert into public.commander_pvp_battles(campaign_id, attacker_id, defender_id, attacker_snapshot, defender_snapshot,
    battle_state, status, expires_at)
  values ('pilot-v1', $1, $2, '{}', '{}', '{}', $3, now() + interval '30 minutes') returning id`,
  [attacker, defender, status])).rows[0].id;

for (const userId of [STUDENT, STREAKER, LONG_STREAK, FIGHTER, CAPPED, ...RIVALS]) await command(userId, 'enroll');

test('enrolment and the HQ work after the progression migrations', async () => {
  const snapshot = await hq(STUDENT);
  assert.equal(snapshot.profile.level, 1);
  assert.ok(Array.isArray(snapshot.unitProgress), 'unit progress is part of the HQ');
  assert.ok(snapshot.loadout.formation, 'the loadout carries the active formation');
  assert.ok(snapshot.loadout.schoolMastery, 'the loadout carries School Mastery');
});

test('the HQ advertises the same stat rank cap that the economy trigger enforces', async () => {
  const snapshot = await hq(STUDENT);
  const enforced = (await db.query(
    `select commander_private.stat_rank_cap(1, rules) cap from public.commander_campaigns where active`)).rows[0].cap;
  assert.equal(snapshot.profile.rankCap, enforced);
  await assert.rejects(command(STUDENT, 'train', 'force'), /commander_rank_cap/);
});

test('daily check-in pays once per day and reports the streak', async () => {
  const first = await checkin(STUDENT);
  assert.equal(first.awarded, true);
  assert.equal(first.xp, 100);
  assert.equal(first.streak, 1);
  const second = await checkin(STUDENT);
  assert.equal(second.awarded, false);
  assert.equal(second.reason, 'already_awarded');
  assert.equal(second.streak, 1);
  assert.equal(await xpOf(STUDENT), 100);
});

test('a consecutive login grows the streak bonus, capped at seven days', async () => {
  await fakeYesterdayLogin(STREAKER, 3);
  const day4 = await checkin(STREAKER);
  assert.equal(day4.streak, 4);
  assert.equal(day4.xp, 175);

  await fakeYesterdayLogin(LONG_STREAK, 9);
  const day10 = await checkin(LONG_STREAK);
  assert.equal(day10.streak, 10);
  assert.equal(day10.xp, 250);
});

test('students cannot award themselves battle XP', async () => {
  await assert.rejects(
    asStudent(FIGHTER, `select public.rpc_commander_award_battle_xp($1, 'practice_victory', null)`, [FIGHTER]),
    /permission denied/,
  );
});

test('a PvP victory pays once, only for the stored winning battle', async () => {
  const battle = await victory(FIGHTER, RIVALS[0]);
  const paid = await awardBattle(FIGHTER, 'pvp_victory', battle);
  assert.equal(paid.awarded, true);
  assert.equal(paid.xp, 60);
  assert.equal((await awardBattle(FIGHTER, 'pvp_victory', battle)).reason, 'already_awarded');

  await assert.rejects(awardBattle(FIGHTER, 'pvp_victory', await victory(FIGHTER, RIVALS[1], 'defeat')),
    /commander_reward_not_eligible/);
  await assert.rejects(awardBattle(RIVALS[1], 'pvp_victory', battle), /commander_reward_not_eligible/,
    'only the attacker of that battle');
  await assert.rejects(awardBattle(FIGHTER, 'pvp_victory', id(999)), /commander_reward_not_eligible/);
});

test('PvP XP pays one win per opponent per day and at most five wins a day', async () => {
  assert.equal((await awardBattle(FIGHTER, 'pvp_victory', await victory(FIGHTER, RIVALS[0]))).reason,
    'opponent_rewarded_today');
  for (const rival of RIVALS.slice(1, 5)) {
    assert.equal((await awardBattle(FIGHTER, 'pvp_victory', await victory(FIGHTER, rival))).xp, 60);
  }
  assert.equal((await awardBattle(FIGHTER, 'pvp_victory', await victory(FIGHTER, RIVALS[5]))).reason,
    'daily_limit_reached');
  assert.equal(await xpOf(FIGHTER), 300);
});

test('only the first Practice victory of the day pays', async () => {
  assert.equal((await awardBattle(FIGHTER, 'practice_victory')).xp, 40);
  assert.equal((await awardBattle(FIGHTER, 'practice_victory')).reason, 'already_awarded');
  await assert.rejects(awardBattle(FIGHTER, 'coin_flip'), /commander_invalid_reward/);
});

test('battle XP respects the campaign daily XP cap', async () => {
  await db.exec(`update public.commander_campaigns set rules = rules || '{"dailyXpCap": 120}' where active`);
  try {
    assert.equal((await checkin(CAPPED)).xp, 100);
    const capped = await awardBattle(CAPPED, 'practice_victory');
    assert.equal(capped.xp, 20);
    assert.equal(capped.reason, 'xp_cap_reached');
    assert.equal(await xpOf(CAPPED), 120);
  } finally {
    await db.exec(`update public.commander_campaigns set rules = rules || '{"dailyXpCap": 3000}' where active`);
  }
});

test('non-students cannot check in', async () => {
  await assert.rejects(checkin(TEACHER), /commander_students_only/);
});

test('XP unlocks Unit Training at level 11', async () => {
  await assert.rejects(command(STUDENT, 'unit_train', 'neon_guard'), /commander_unit_training_locked/);
  // Level 11 needs (11 - 1) * (10 * 11 + 80) = 1,900 XP.
  await db.exec(`update public.commander_profiles set xp = 1900 where user_id = '${STUDENT}'`);
  const trained = await command(STUDENT, 'unit_train', 'neon_guard');
  assert.equal(trained.profile.level, 11);
  const unit = trained.unitProgress.find((entry) => entry.itemId === 'neon_guard' || entry.item_id === 'neon_guard');
  assert.ok(unit, 'unit progress is returned');
  assert.equal(unit.rank ?? unit.unitRank ?? unit.unit_rank, 2);
});
