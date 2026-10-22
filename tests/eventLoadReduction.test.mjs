import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { build } from 'esbuild';

// Bundles a service with a fake Supabase client so its request counts can be checked.
async function load(entry, exportsLine) {
  const compiled = await build({
    stdin: { contents: exportsLine, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, format: 'cjs', write: false, logLevel: 'silent',
    define: { 'import.meta.env': '{"DEV":false,"PROD":true,"MODE":"test"}' },
    plugins: [{ name: 'fixture', setup(b) {
      b.onResolve({ filter: /supabaseClient(\.js|\.ts)?$/ }, () => ({ path: 'fixture', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase=globalThis.fixture;', loader: 'js' }));
    } }],
  });
  return compiled.outputFiles[0].text;
}

function query(calls, table, rows) {
  const chain = {
    select() { return chain; }, eq() { return chain; }, delete() { calls.push(`${table}:delete`); return chain; },
    upsert(payload) { calls.push(`${table}:upsert`); rows.current = { ...payload }; return chain; },
    async maybeSingle() { calls.push(`${table}:read`); await Promise.resolve(); return { data: rows.current, error: null }; },
    async single() { return { data: rows.current, error: null }; },
    then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); },
  };
  return chain;
}

test('onboarding state: overlapping dashboard reads share one query and writes keep the cache correct', async () => {
  const code = await load('onboarding', "export {getOnboardingState,updateOnboardingState,resetOnboarding} from './src/features/onboarding/onboardingService';");
  const calls = [];
  const rows = { current: { user_id: 'u1', completed_steps: ['a'], metadata: {} } };
  const fixture = {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table) => query(calls, table, rows),
    rpc: async () => ({ data: null, error: null }),
  };
  const context = vm.createContext({ module: { exports: {} }, console: { ...console, warn() {}, info() {} }, Date, Promise, Map, Set, fixture, window: undefined, localStorage: undefined });
  vm.runInContext(code, context);
  const api = context.module.exports;

  await Promise.all(Array.from({ length: 10 }, () => api.getOnboardingState('u1')));
  await api.getOnboardingState('u1');
  assert.equal(calls.filter((c) => c === 'user_onboarding:read').length, 1, 'cached reads');

  // A write starts from a fresh read, then later reads see the written row without a query.
  const written = await api.updateOnboardingState({ completed_steps: ['a', 'b'] }, 'u1');
  assert.deepEqual([...written.completed_steps], ['a', 'b']);
  assert.equal(calls.filter((c) => c === 'user_onboarding:read').length, 2, 'write reads fresh');
  const after = await api.getOnboardingState('u1');
  assert.deepEqual([...after.completed_steps], ['a', 'b']);
  assert.equal(calls.filter((c) => c === 'user_onboarding:read').length, 2, 'write primes cache');

  // Reset clears the cache so the next read goes to the database.
  await api.resetOnboarding('u1');
  rows.current = null;
  assert.equal(await api.getOnboardingState('u1'), null);
  assert.equal(calls.filter((c) => c === 'user_onboarding:read').length, 3, 'reset invalidates');
});

test('daily streak RPC is shared across profile loads and never replays the celebration', () => {
  const source = readFileSync('services/gameService.ts', 'utf8');
  assert.match(source, /dailyStreakRecorded\?\.userId === userId && dailyStreakRecorded\.date === today/);
  assert.match(source, /claimed: initiator && data\.claimed === true/);
  assert.match(source, /return null; \/\/ Not remembered: the next profile load retries\./);
  assert.match(source, /supabase\.rpc\('rpc_record_daily_streak'\)/);
});

test('rewards trigger one light batched profile sync instead of full whoami reloads', () => {
  const app = readFileSync('App.tsx', 'utf8');
  const grant = app.slice(app.indexOf('const handleGrantReward'), app.indexOf('const handleDismissAnnouncement'));
  assert.doesNotMatch(grant, /GameService\.whoami\(/);
  assert.doesNotMatch(grant, /refreshProfile\(\)/);
  assert.match(grant, /scheduleRewardProfileSync\(\)/);
  assert.match(grant, /scheduleRewardProfileSync\(2000\)/);
  assert.match(app, /void refreshProfile\(true\);/);
});

test('school plan details are cached for minutes, not seconds', () => {
  const tier = readFileSync('services/tierService.ts', 'utf8');
  assert.match(tier, /createScopedReadCache<SchoolPlanDetails>\(5 \* 60 \* 1000/);
});

test('assignment answer recovery backs off with jitter and still retries at once when back online', () => {
  const quest = readFileSync('components/QuestView.tsx', 'utf8');
  assert.match(quest, /Math\.min\(15000 \* 2 \*\* \(retry\.attempts \+ 1\), 120000\)/);
  assert.match(quest, /event\?\.type !== 'online' && now < retry\.nextAt/);
});
