import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAuthCallbackPath,
  resolvePostAuthPath,
  shouldUseGlobalAuthLoader,
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

test('tab resume token refresh avoids global auth loader for authenticated users', () => {
  assert.equal(shouldUseGlobalAuthLoader('TOKEN_REFRESHED', true), false);
  assert.equal(shouldUseGlobalAuthLoader('USER_UPDATED', true), false);
});

test('missing or first session checks may use global auth loader', () => {
  assert.equal(shouldUseGlobalAuthLoader('TOKEN_REFRESHED', false), true);
  assert.equal(shouldUseGlobalAuthLoader('SIGNED_IN', true), true);
});
