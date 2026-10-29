import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

// Exercises supabase/migrations/20261029150000_pvp_attack_integrity_and_rewards.sql on a minimal schema.
// Outcomes are forced through attack/defence power: a huge attack always wins the roll, 0 attack always loses.
const db = new PGlite();
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ATTACKER = id(1), DEFENDER = id(2), SHIELDED = id(3), CRACKED = id(4), STRONG_DEF = id(5);
const SCHOOL = id(90);

await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.users(
  id uuid primary key, username text, level int default 1, xp int default 0, coins int default 0, gemstones int default 0,
  ap_now int default 10, ap_max int default 10, last_ap_update timestamptz default now(),
  attack_power int, defense_power int, is_admin boolean default false, role text default 'student',
  is_banned boolean default false, school_id uuid, last_attacked_at timestamptz,
  pvp_score int default 0, xp_from_pvp int default 0, coins_from_pvp int default 0);
create table public.inventory(id uuid primary key default gen_random_uuid(), user_id uuid, kind text, state text, expires_at timestamptz);
create table public.activities(id bigserial primary key, kind text, actor_id uuid, actor_username text, target_id uuid,
  target_username text, data jsonb, created_at timestamptz);
create table public.pvp_attack_attempts(request_id uuid primary key, attacker_id uuid not null, defender_id uuid not null,
  response jsonb not null, created_at timestamptz default now());
alter table public.pvp_attack_attempts enable row level security;
grant usage on schema public to anon, authenticated;
grant all on public.pvp_attack_attempts to anon, authenticated;
create policy pvp_attack_attempts_owner_select on public.pvp_attack_attempts for select to authenticated
  using (attacker_id = auth.uid() or defender_id = auth.uid());
create policy pvp_attack_attempts_owner_insert on public.pvp_attack_attempts for insert to authenticated
  with check (attacker_id = auth.uid());
create function public.calculate_current_ap(a int, m int, t timestamptz) returns int language sql as $$ select a $$;
create function public.notify_attack_incoming(d uuid, n text, p int) returns void language sql as $$ select $$;
create function public.xp_status(p_xp int) returns jsonb language sql as $$ select jsonb_build_object('xp', p_xp) $$;
create function public.rpc_hack_attempt(p_defender_id uuid, p_request_id uuid default null) returns json
  language sql security definer as $$ select '{}'::json $$;
insert into public.users(id, username, coins, attack_power, defense_power, school_id) values
  ('${ATTACKER}','Aidai',1000,1000000,10,'${SCHOOL}'),
  ('${DEFENDER}','Bek',500,10,1,'${SCHOOL}'),
  ('${SHIELDED}','Cholpon',500,10,1,'${SCHOOL}'),
  ('${CRACKED}','Dastan',500,10,1,'${SCHOOL}'),
  ('${STRONG_DEF}','Eldiyar',500,10,1,'${SCHOOL}');
insert into public.inventory(user_id, kind, state) values
  ('${SHIELDED}','shield','active'),
  ('${CRACKED}','shield','active');
`);
await db.exec(readFileSync('supabase/migrations/20261029150000_pvp_attack_integrity_and_rewards.sql', 'utf8'));

const asStudent = async (userId, sql, params = []) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role;');
  }
};
const attack = async (defender, requestId = crypto.randomUUID()) =>
  (await asStudent(ATTACKER, 'select public.rpc_hack_attempt($1, $2) as r', [defender, requestId])).rows[0].r;
const resetCooldowns = () => db.exec('update public.users set last_attacked_at = null');

test('a win pays 30 XP and steals 10% of the defender coins', async () => {
  const r = await attack(DEFENDER);
  assert.equal(r.result, 'win');
  assert.equal(r.attacker_deltas.xp, 30);
  assert.equal(r.attacker_deltas.coins, 50);
  assert.equal(r.shield_state, 'none');
  assert.ok(r.combat_stats.win_chance > 99, 'combat stats are returned for the odds meter');
});

test('a shield-blocked attack pays 0 XP and 0 coins (was +30 XP)', async () => {
  const before = (await db.query(`select xp, pvp_score from public.users where id = $1`, [ATTACKER])).rows[0];
  const r = await attack(SHIELDED);
  assert.equal(r.result, 'blocked');
  assert.equal(r.attacker_deltas.xp, 0);
  assert.equal(r.attacker_deltas.coins, 0);
  assert.equal(r.shield_state, 'remaining');
  const after = (await db.query(`select xp, pvp_score from public.users where id = $1`, [ATTACKER])).rows[0];
  assert.deepEqual(after, before, 'blocked attack changes neither XP nor PvP score');
});

test('a cracker breaking a shield reports shield_state removed', async () => {
  await db.exec(`insert into public.inventory(user_id, kind, state) values ('${ATTACKER}','cracker','unused')`);
  const r = await attack(CRACKED);
  assert.equal(r.result, 'win');
  assert.equal(r.shield_state, 'removed');
});

test('a loss costs 10 XP and coins', async () => {
  await db.exec(`update public.users set attack_power = 0 where id = '${ATTACKER}'`);
  const r = await attack(STRONG_DEF);
  assert.equal(r.result, 'lose');
  assert.equal(r.attacker_deltas.xp, -10);
  assert.ok(r.attacker_deltas.coins < 0);
  await db.exec(`update public.users set attack_power = 1000000 where id = '${ATTACKER}'`);
});

test('replaying a request id returns the stored result without a second attack', async () => {
  await resetCooldowns();
  const requestId = crypto.randomUUID();
  const first = await attack(DEFENDER, requestId);
  const coinsAfterFirst = (await db.query(`select coins from public.users where id = $1`, [DEFENDER])).rows[0].coins;
  const replay = await attack(DEFENDER, requestId);
  assert.deepEqual(replay, first);
  const coinsAfterReplay = (await db.query(`select coins from public.users where id = $1`, [DEFENDER])).rows[0].coins;
  assert.equal(coinsAfterReplay, coinsAfterFirst);
});

test('students cannot insert attack receipts directly (no spoofed raid alerts)', async () => {
  await assert.rejects(
    asStudent(ATTACKER,
      `insert into public.pvp_attack_attempts(request_id, attacker_id, defender_id, response) values ($1, $2, $3, '{"result":"win"}'::jsonb)`,
      [crypto.randomUUID(), ATTACKER, DEFENDER]),
    /permission denied/i,
  );
  for (const sql of [
    'update public.pvp_attack_attempts set response = response',
    'delete from public.pvp_attack_attempts',
    'truncate public.pvp_attack_attempts',
  ]) {
    await assert.rejects(asStudent(ATTACKER, sql), /permission denied/i, sql);
  }
  const visible = await asStudent(ATTACKER, 'select count(*)::int c from public.pvp_attack_attempts');
  assert.ok(visible.rows[0].c > 0, 'students can still read their own receipts');
});
