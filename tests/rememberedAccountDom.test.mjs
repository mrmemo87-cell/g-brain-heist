import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';

const accountKey = 'bh_remembered_account_v1';
const intentKey = 'bh_remember_account_intent_v1';
import { uiBundle, user, serviceBundle } from './helpers/rememberedAccountHarness.mjs';
const tick = () => new Promise(resolve => setTimeout(resolve, 25));
async function mount(area = 'ielts', saved = null, options = {}) {
  const errors = [], vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://example.com/ielts/reading/42?assignment=one', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  w.area = area; w.googleCalls = []; w.passwordCalls = []; w.user = user; w.googleFailure = options.googleFailure;
  if (saved) w.localStorage.setItem(accountKey, JSON.stringify(saved));
  if (options.blocked) {
    for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(w, name, { get() { throw Error('Blocked storage'); } });
  }
  w.eval(uiBundle);
  for (let i = 0; i < 100 && !w.document.querySelector('button'); i++) await tick();
  const button = label => [...w.document.querySelectorAll('button')].find(b => b.textContent.trim() === label);
  return { w, dom, button, errors, close: () => dom.window.close() };
}
const saved = provider => ({ version: 1, userId: user.id, email: user.email, name: 'Test Learner', provider, expiresAt: Date.now() + 60_000 });

test('account hints require explicit consent; successful auth writes allowlisted fields only', () => {
  const d = new JSDOM('', { url: 'https://example.com', runScripts: 'outside-only' }); const w = d.window; w.eval(serviceBundle);
  try {
    w.accounts.rememberAuthenticatedAccount(user); assert.equal(w.accounts.readRememberedAccount(), null);
    w.accounts.prepareRememberAccount(true, 'google'); assert.equal(w.accounts.readRememberedAccount(), null);
    w.accounts.rememberAuthenticatedAccount(user); const account = w.accounts.readRememberedAccount();
    assert.equal(account.email, user.email); assert.equal(account.provider, 'google');
    assert.deepEqual(Object.keys(account).sort(), ['email', 'expiresAt', 'name', 'provider', 'userId', 'version']);
    assert.equal(w.sessionStorage.getItem(intentKey), null); assert.ok(!w.localStorage.getItem(accountKey).includes('must-not-save'));
    const expiry = account.expiresAt; w.accounts.rememberAuthenticatedAccount(user); assert.equal(w.accounts.readRememberedAccount().expiresAt, expiry);
    w.accounts.rememberAuthenticatedAccount({ ...user, id: 'other', email: 'other@example.com' }); assert.equal(w.accounts.readRememberedAccount().email, user.email);
    w.accounts.prepareRememberAccount(false, 'password'); w.accounts.rememberAuthenticatedAccount({ ...user, id: 'other' }); assert.equal(w.accounts.readRememberedAccount(), null);
  } finally { d.window.close(); }
});

test('expired, corrupt and unknown-version hints fail closed; forgotten hints are not recreated by refresh', () => {
  const d = new JSDOM('', { url: 'https://example.com', runScripts: 'outside-only' }); const w = d.window; w.eval(serviceBundle);
  try {
    for (const value of ['invalid-json', JSON.stringify({ ...saved('google'), expiresAt: Date.now() - 1 }), JSON.stringify({ ...saved('google'), version: 2 }), JSON.stringify({ ...saved('google'), email: '<bad>' })]) {
      w.localStorage.setItem(accountKey, value); assert.equal(w.accounts.readRememberedAccount(), null); assert.equal(w.localStorage.getItem(accountKey), null);
    }
    w.accounts.prepareRememberAccount(true, 'google'); w.accounts.forgetRememberedAccount(); w.accounts.rememberAuthenticatedAccount(user); assert.equal(w.accounts.readRememberedAccount(), null);
    w.sessionStorage.setItem(intentKey, JSON.stringify({ remember: true, provider: 'google', expiresAt: Date.now() - 1 }));
    w.accounts.rememberAuthenticatedAccount(user); assert.equal(w.accounts.readRememberedAccount(), null);
  } finally { d.window.close(); }
});

for (const area of ['ielts', 'main']) {
  test(`${area}: new sign-in is opt-in and Google double taps create one request`, async () => {
    const m = await mount(area); try {
      assert.equal(m.w.document.querySelector('input[type=checkbox]').checked, false);
      m.w.document.querySelector('input[type=checkbox]').click(); await tick();
      m.button('Continue with Google').click(); m.button('Continue with Google').click(); await tick();
      assert.equal(m.w.googleCalls.length, 1);
      assert.equal(JSON.parse(m.w.sessionStorage.getItem(intentKey)).remember, true);
      if (area === 'ielts') assert.equal(m.w.sessionStorage.getItem('ielts_auth_intent'), '/ielts/reading/42?assignment=one');
      m.w.accounts.rememberAuthenticatedAccount(user); assert.equal(m.w.accounts.readRememberedAccount().email, user.email);
      assert.deepEqual(m.errors, []);
    } finally { m.close(); }
  });
  test(`${area}: returning Google account uses hint; switch and forget remain separate`, async () => {
    const m = await mount(area, saved('google')); try {
      assert.equal(m.button('Continue with Google'), undefined);
      if (area === 'main') assert.ok(![...m.w.document.querySelectorAll('button')].find(button => button.textContent.includes('Ask Brains')).className.includes('fixed'));
      m.button('Continue as Test Learner').click(); await tick(); assert.equal(m.w.googleCalls[0], user.email);
      m.button('Use another account').click(); await tick();
      assert.ok(m.button('Continue with Google')); await tick(); assert.equal(m.w.document.activeElement, m.button('Continue with Google')); assert.equal(m.w.document.querySelector('input[type=checkbox]').checked, false);
      assert.ok(m.w.accounts.readRememberedAccount()); assert.deepEqual(m.errors, []);
    } finally { m.close(); }
    const n = await mount(area, saved('google')); try {
      n.button('Forget this account').click(); await tick(); assert.equal(n.w.accounts.readRememberedAccount(), null); assert.ok(n.button('Continue with Google'));
    } finally { n.close(); }
  });
  test(`${area}: password account prefills email and focuses password without authenticating`, async () => {
    const m = await mount(area, saved('password')); try {
      m.button('Continue as Test Learner').click(); await tick(); await tick();
      assert.equal(m.w.document.querySelector('input[type=email]').value, user.email);
      assert.equal(m.w.document.activeElement, m.w.document.querySelector('input[autocomplete=current-password]'));
      assert.equal(m.w.passwordCalls.length, 0); assert.equal(m.w.document.querySelector('input[type=password]').value, '');
      assert.deepEqual(m.errors, []);
    } finally { m.close(); }
  });
  test(`${area}: blocked storage still allows Google sign-in; provider errors offer retry`, async () => {
    const m = await mount(area, null, { blocked: true }); try {
      m.button('Continue with Google').click(); await tick(); assert.equal(m.w.googleCalls.length, 1); assert.deepEqual(m.errors, []);
    } finally { m.close(); }
    const n = await mount(area, saved('google'), { googleFailure: true }); try {
      n.button('Continue as Test Learner').click(); await tick();
      assert.ok(n.w.document.querySelector('[role=alert]')); assert.equal(n.w.sessionStorage.getItem(intentKey), null);
      assert.equal(n.button('Continue as Test Learner').disabled, false);
      n.w.googleFailure = false; n.button('Continue as Test Learner').click(); await tick(); assert.equal(n.w.googleCalls.length, 2);
    } finally { n.close(); }
  });
}

test('the shared auth observer remembers successful sessions without API calls and tolerates blocked storage', async () => {
  const clientBundle = (await (await import('esbuild')).build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
import './services/supabaseClient'; import * as accounts from './services/rememberedAccount'; window.accounts=accounts;` },
    bundle: true, write: false, format: 'iife', plugins: [{ name: 'supabase-observer-boundary', setup(b) {
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'sdk', namespace: 'observer' }));
      b.onResolve({ filter: /\.\/env\.js$/ }, () => ({ path: 'env', namespace: 'observer' }));
      b.onLoad({ filter: /.*/, namespace: 'observer' }, args => ({ contents: args.path === 'env'
        ? "export const getEnvVar=key=>key.includes('URL')?'https://example.supabase.co':'test';"
        : 'export function createClient(url,key,options){window.authOptions=options; return {auth:{onAuthStateChange(fn){window.authObserver=fn;return {data:{subscription:{unsubscribe(){}}}}}}};}' }));
    } }] })).outputFiles[0].text;
  for (const blocked of [false, true]) {
    const d = new JSDOM('', { url: 'https://example.com', runScripts: 'outside-only' }); const w = d.window;
    try {
      if (blocked) Object.defineProperty(w, 'localStorage', { get() { throw Error('Blocked'); } });
      w.eval(clientBundle);
      assert.equal(w.authOptions.auth.persistSession, true); assert.equal(w.authOptions.auth.autoRefreshToken, true);
      w.accounts.prepareRememberAccount(true, 'google');
      w.authObserver('SIGNED_IN', { user });
      assert.equal(w.accounts.readRememberedAccount()?.email ?? null, blocked ? null : user.email);
      w.authObserver('SIGNED_OUT', null);
      assert.equal(w.accounts.readRememberedAccount()?.email ?? null, blocked ? null : user.email);
    } finally { d.window.close(); }
  }
});
