// Local Cursed Commander harness for UX work and browser checks.
// Runs the real Commander migrations in an in-browser PGlite database and the real battle
// engines in-page, so the HQ, Practice and Player Battles can be played without Supabase.
// Run `npm run dev:commander-fixture`, then open /e2e/commander.fixture.html?state=new|rookie|veteran
// (new = not enrolled, rookie = Level 2, veteran = Level 12).
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PGlite } from '@electric-sql/pglite';
import CommanderHeadquarters from '../src/features/cursedCommander/CommanderHeadquarters';
import { supabase } from '../services/supabaseClient';
import { applyPracticeTurn, buildOwnedPracticeBattle, startPracticeBattle } from '../supabase/functions/commander_practice/engine';
import { applyCommanderPvpTurn, buildCommanderPvpBattle } from '../supabase/functions/commander_pvp/engine';
import '../src/index.css';

const migrations = import.meta.glob('../supabase/migrations/*commander*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const ORDER = [
  '20260913073842', '20260913083836', '20260913183000', '20260913190000', '20260915123000',
  '20260916063851', '20260916082308', '20260916123703', '20260916195758', '20260916195926', '20260917145000',
  '20260915140000', '20260915193000', '20260915213000', '20260915233000', '20260915233500', '20261030090000',
];
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const ME = id(1);
const RIVALS = [
  { id: id(11), name: 'Aidai', xp: 900 },
  { id: id(12), name: 'Bekzat', xp: 2600 },
  { id: id(13), name: 'Cholpon', xp: 300 },
];
const state = new URLSearchParams(location.search).get('state') ?? 'rookie';
const log: unknown[] = []; (window as any).__commanderCalls = log;

const db = new PGlite();
const ready = (async () => {
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
    grant usage on schema public to anon, authenticated, service_role;`);
  for (const version of ORDER) {
    const key = Object.keys(migrations).find((path) => path.includes(`/${version}_`));
    if (!key) throw new Error(`missing migration ${version}`);
    await db.exec(migrations[key]);
  }
  await db.query(`insert into public.users(id, username, coins, gemstones) values ($1, 'You', $2, 40)`, [ME, state === 'veteran' ? 6000 : 1200]);
  for (const rival of RIVALS) await db.query(`insert into public.users(id, username, coins) values ($1, $2, 3000)`, [rival.id, rival.name]);
  const enroll = async (userId: string) => {
    await as(userId, `select public.rpc_commander_command(gen_random_uuid(), 'enroll', null, null)`);
  };
  for (const rival of RIVALS) {
    await enroll(rival.id);
    await db.query(`update public.commander_profiles set xp = $2 where user_id = $1`, [rival.id, rival.xp]);
  }
  if (state !== 'new') await enroll(ME);
  if (state === 'veteran') await db.query(`update public.commander_profiles set xp = 2400 where user_id = $1`, [ME]);
})();

async function as<T = any>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(userId
    ? `set role authenticated; select set_config('request.jwt.claim.sub','${userId}',false); select set_config('request.jwt.claim.role','authenticated',false);`
    : `set role service_role; select set_config('request.jwt.claim.role','service_role',false);`);
  try { return (await db.query<T>(sql, params)).rows; }
  finally { await db.exec(`reset role; select set_config('request.jwt.claim.role','',false);`); }
}

const sqlError = (cause: unknown) => ({ message: cause instanceof Error ? cause.message : String(cause), code: 'P0001' });
const thenable = (run: () => Promise<{ data: unknown; error: unknown }>) => {
  const promise = (async () => { await ready; await new Promise((r) => setTimeout(r, 120)); return run(); })();
  const builder: any = { abortSignal: () => builder, then: (a: any, b: any) => promise.then(a, b) };
  return builder;
};

(supabase as any).rpc = (name: string, args: Record<string, unknown> = {}) => thenable(async () => {
  log.push({ rpc: name, args });
  const keys = Object.keys(args);
  const call = `select public.${name}(${keys.map((key, index) => `${key} => $${index + 1}`).join(', ')}) as r`;
  try {
    const rows = await as(ME, call, keys.map((key) => args[key]));
    return { data: (rows[0] as any)?.r ?? null, error: null };
  } catch (cause) { return { data: null, error: sqlError(cause) }; }
});

(supabase.auth as any).getSession = async () => ({ data: { session: { access_token: 'fixture', user: { id: ME } } }, error: null });

const ownedLoadout = async (userId: string) =>
  (await as(null, `select public.rpc_commander_owned_loadout($1) as r`, [userId]))[0].r;
const awardXp = async (source: string, battleId: string | null) => {
  try { return (await as(null, `select public.rpc_commander_award_battle_xp($1, $2, $3) as r`, [ME, source, battleId]))[0].r; }
  catch { return null; }
};
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;

// supabase.functions is a getter that builds a new client on every read, so replace the getter.
const invoke = async (fn: string, { body }: { body: any }) => {
  await ready;
  await new Promise((r) => setTimeout(r, 250));
  log.push({ fn, body });
  try {
    if (fn !== 'commander_practice') throw new Error('unknown_function');
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    if (body.action === 'start') {
      const battle = body.loadout === 'owned' ? buildOwnedPracticeBattle(randomSeed(), await ownedLoadout(ME)) : startPracticeBattle(randomSeed());
      return { data: { ok: true, transcript: btoa(JSON.stringify(battle)), expiresAt, battle }, error: null };
    }
    const battle = applyPracticeTurn(JSON.parse(atob(body.transcript)), { move: body.move, targetId: body.targetId });
    const xpAward = battle.status === 'victory' ? await awardXp('practice_victory', null) : null;
    return { data: { ok: true, transcript: btoa(JSON.stringify(battle)), expiresAt, battle, xpAward }, error: null };
  } catch (cause) {
    return { data: { ok: false, error: cause instanceof Error ? cause.message : String(cause) }, error: null };
  }
};

Object.defineProperty(supabase, 'functions', { configurable: true, get: () => ({ invoke }) });

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!url.includes('/functions/v1/commander_pvp')) return realFetch(input, init);
  await ready;
  await new Promise((r) => setTimeout(r, 250));
  const body = JSON.parse(String(init?.body ?? '{}'));
  log.push({ fn: 'commander_pvp', body });
  const respond = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  const rowResponse = async (row: any) => {
    const opponent = (await db.query<any>(`select id, username from public.users where id = $1`, [row.defender_id])).rows[0];
    return { ok: true, mode: 'pvp', persistentWrites: true, battleId: row.id, expiresAt: row.expires_at,
      opponent: { userId: opponent.id, username: opponent.username, avatarUrl: null }, battle: { ...row.battle_state, seed: 0 } };
  };
  try {
    if (body.action === 'start') {
      const opponent = (await db.query<any>(`select username from public.users where id = $1`, [body.targetUserId])).rows[0];
      const battle = buildCommanderPvpBattle(randomSeed(), await ownedLoadout(ME), await ownedLoadout(body.targetUserId), opponent.username);
      const row = (await db.query<any>(`insert into public.commander_pvp_battles(campaign_id, attacker_id, defender_id, attacker_snapshot, defender_snapshot, battle_state, expires_at)
        values ('pilot-v1', $1, $2, '{}', '{}', $3, now() + interval '30 minutes') returning *`, [ME, body.targetUserId, battle])).rows[0];
      return respond(200, await rowResponse(row));
    }
    const row = (await db.query<any>(body.battleId
      ? `select * from public.commander_pvp_battles where id = $1`
      : `select * from public.commander_pvp_battles where attacker_id = $1 and status = 'active' order by created_at desc limit 1`, [body.battleId ?? ME])).rows[0];
    if (!row) return respond(404, { ok: false, error: 'commander_pvp_battle_not_found' });
    if (body.action === 'resume') return respond(200, await rowResponse(row));
    if (body.action === 'cancel') {
      await db.query(`update public.commander_pvp_battles set status = 'cancelled', finished_at = now() where id = $1`, [row.id]);
      return respond(200, { ok: true, cancelled: true, battleId: row.id });
    }
    const next = applyCommanderPvpTurn(row.battle_state, { move: body.move, targetId: body.targetId });
    const updated = (await db.query<any>(`update public.commander_pvp_battles set battle_state = $2, status = $3, state_version = state_version + 1,
      finished_at = case when $3 = 'active' then null else now() end where id = $1 returning *`, [row.id, next, next.status])).rows[0];
    const xpAward = next.status === 'victory' ? await awardXp('pvp_victory', row.id) : null;
    return respond(200, { ...(await rowResponse(updated)), xpAward });
  } catch (cause) {
    return respond(400, { ok: false, error: cause instanceof Error ? cause.message : String(cause) });
  }
};

(window as any).__commanderDb = db;
createRoot(document.getElementById('root')!).render(
  <div className="min-h-screen bg-slate-950 text-white">
    <CommanderHeadquarters userId={ME} onClose={() => { (window as any).__closed = true; }} onBalanceChange={() => {}} />
  </div>,
);
