import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAuthCallbackPath,
  resolvePostAuthPath,
  shouldUseGlobalAuthLoader,
  isSafeIeltsReturnPath,
  readIeltsAuthIntent,
  consumeIeltsAuthIntent,
  IELTS_AUTH_INTENT_KEY,
} from '../src/lib/authFlowGuards.js';

test('valid session leaves auth callback route', () => {
  assert.equal(isAuthCallbackPath('/auth/callback'), true);
  assert.equal(isAuthCallbackPath('/auth/callback/'), true);
  assert.equal(resolvePostAuthPath('/auth/callback'), '/');
});

test('non-callback app route is preserved after auth resolution', () => {
  assert.equal(isAuthCallbackPath('/dashboard'), false);
  assert.equal(resolvePostAuthPath('/dashboard'), '/dashboard');
});

test('tab resume auth events avoid global auth loader for authenticated users', () => {
  assert.equal(shouldUseGlobalAuthLoader('SIGNED_IN', true), false);
  assert.equal(shouldUseGlobalAuthLoader('TOKEN_REFRESHED', true), false);
  assert.equal(shouldUseGlobalAuthLoader('USER_UPDATED', true), false);
});

test('missing or first session checks may use global auth loader', () => {
  assert.equal(shouldUseGlobalAuthLoader('TOKEN_REFRESHED', false), true);
  assert.equal(shouldUseGlobalAuthLoader('SIGNED_IN', false), true);
  assert.equal(shouldUseGlobalAuthLoader('INITIAL_SESSION', true), true);
});


test('IELTS auth intent only accepts same-origin IELTS paths', () => {
  assert.equal(isSafeIeltsReturnPath('/ielts/trial-test-2'), true);
  assert.equal(isSafeIeltsReturnPath('/ielts/apply-prime'), true);
  assert.equal(isSafeIeltsReturnPath('/dashboard'), false);
  assert.equal(isSafeIeltsReturnPath('https://evil.example/ielts'), false);
  assert.equal(isSafeIeltsReturnPath('//evil.example/ielts'), false);
});

test('IELTS auth intent is consumed only after a valid IELTS path is available', () => {
  const values = new Map<string, string>([[IELTS_AUTH_INTENT_KEY, '/ielts/trial-test-2']]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
  };

  assert.equal(readIeltsAuthIntent(storage), '/ielts/trial-test-2');
  assert.equal(consumeIeltsAuthIntent(storage), '/ielts/trial-test-2');
  assert.equal(readIeltsAuthIntent(storage), null);
});

test('invalid IELTS auth intent is ignored and not consumed as a redirect target', () => {
  const values = new Map<string, string>([[IELTS_AUTH_INTENT_KEY, '/dashboard']]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
  };

  assert.equal(readIeltsAuthIntent(storage), null);
  assert.equal(consumeIeltsAuthIntent(storage), null);
  assert.equal(values.get(IELTS_AUTH_INTENT_KEY), '/dashboard');
});
